const config = require('../config');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
const TeleBot = require('telebot');
const Database = require('better-sqlite3');
const db = new Database(config('db').path, {fileMustExist: true}); // https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
const moment = require('moment');
const utils = require("./utils.js");

const myFormat = printf(({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
});
// Configure a logger
const logger = createLogger({
    level: "info", // "debug"
    format: combine(
        format.colorize(),
        format.simple(),
        timestamp(),
        myFormat
    ),
    transports: [
        new transports.Console({colorize: true}),
    ]
});

const BUTTONS = utils.BUTTONS;
const bot = new TeleBot({
    token: config('telegram').token,
    usePlugins: ['askUser', 'namedButtons'],
    pluginConfig: {
        namedButtons: {
            buttons: BUTTONS
        }
    }
}); // https://github.com/mullwar/telebot

const replyMarkupOptions = bot.keyboard([ // Tastiera di default con i tre bottoni
    [BUTTONS.add.label, BUTTONS.lista.label, BUTTONS.remove.label]
], {resize: true});
const replyMarkupAnnulla = bot.keyboard([ // Solo bottone 'annulla'
    [BUTTONS.annulla.label]
], {resize: true});

/**
 * Verifica se l'utente ha già utilizzato il bot in precedenza, in caso negativo salva il suo uid
 * @param {number} uid uid della chat/utente
 * @returns {Object} {{success: boolean, chatId: number}}
 */
function isNew(uid) {
    let idUser = String(uid);
    let row = db.prepare('SELECT id, COUNT(*) AS rep FROM ids WHERE uid = ?;').get(idUser);

    if (row.rep === 0) {
        let sql = db.prepare("INSERT INTO ids (uid) VALUES (?);").run(idUser);
        return {success: true, chatId: sql.lastInsertRowid};
    } else {
        return {success: false, chatId: String(row.id)};
    }
}

/**
 * Ottiene gli anni data la data di nascita
 * @param {string} date data formattata in YYYY-MM-DD
 * @returns {number} età
 */
function getEta(date) {
    return moment().diff(date, 'years', false)
}

/**
 * Restituisce la query dei compleanni salvati da quell'utente ordinati per mese-giorno
 * @param {number} uid uid della chat/utente
 * @returns {{ empty: boolean, res: Object}}
 */
function getBirthdays(uid) {
    let res = db.prepare('SELECT * FROM ids, birthday WHERE ids.id = birthday.chatId AND ids.uid = ?;').all(String(uid));

    let d1 = moment();
    let d2 = moment();

    res.sort(function (a, b) {
        a = a.date.split('-');
        b = b.date.split('-');

        d1.date(a[2]);
        d1.month(a[1] - 1);
        d2.date(b[2]);
        d2.month(b[1] - 1);

        return d1 - d2;
    });

    return {empty: res.length === 0, res: res};
}

/**
 * Restituisce una stringa formattata con la lista dei compleanni salvati ed eventuale link per cancellazione
 * @param {number} uid uid della chat/utente
 * @param {boolean} elimina true per includere link di cancellazione
 * @returns {string}
 */
function printBirthdays(uid, elimina) {
    let send = String();
    let bir = getBirthdays(uid);

    if (bir.empty) {
        send = "Non hai ancora inserito nessun compleanno!";
    } else {
        if (elimina) {
            bir.res.forEach(function (row) { // Lista per bottone 'Rimuovi'
                send += `${row.name}: ${moment(row.date, "YYYY-MM-DD").format("DD/MM/YYYY")} - /del_${row.id}\n`;
            });
        } else { // Lista per bottone 'Lista'
            bir.res.forEach(function (row) {
                let eta = getEta(row.date); // Anni
                let etaTesto = utils.itLang.anno.plur;
                if (eta === 0) { // Passo ai mesi
                    eta = moment().diff(row.date, 'month');
                    etaTesto = (eta === 1) ? utils.itLang.mese.sing : utils.itLang.mese.plur;
                    if (eta === 0) { // Passo ai giorni
                        eta = moment().diff(row.date, 'day');
                        etaTesto = (eta === 1) ? utils.itLang.giorno.sing : utils.itLang.giorno.plur;
                    }
                } else if (eta === 1) {
                    etaTesto = utils.itLang.anno.sing;
                }
                send += `${row.name}: ${moment(row.date, "YYYY-MM-DD").format("DD/MM/YYYY")} - ${eta} ${etaTesto}\n`;
            });
        }
    }
    return send;
}

/**
 * Converte eventuali caratteri speciali per prevenire SQL Injection
 * @param {string} data stringa da elaborare
 * @returns {string} stringa elaborata
 */
function disarmData(data) {
    let map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    data = data
        .trim()
        .replace(/\\(.)/mg, "$1")
        .replace(/[&<>"']/g, function (m) { return map[m]; })
        .replace(/[\u00A0-\u9999<>\&]/gim, function (i) { return '&#' + i.charCodeAt(0) + ';'; })
        .replace("'", "''");

    return data;
}

bot.on('/add', msg => { // Aggiunta compleanno
    logger.info(`/add`, {label: msg.from.id});

    return msg.reply.text('Inserisci la data di nascita (gg/mm/aaaa)', {
        ask: 'comp',
        replyMarkup: replyMarkupAnnulla
    });
});

/**
 * Regex per data in formato GG/MM/AAAA
 * @const {RegExp}
 * @type {RegExp}
 */
const re = /(^(((0[1-9]|1[0-9]|2[0-8])[\/](0[1-9]|1[012]))|((29|30|31)[\/](0[13578]|1[02]))|((29|30)[\/](0[4,6,9]|11)))[\/](19|[2-9][0-9])\d\d$)|(^29[\/]02[\/](19|[2-9][0-9])(00|04|08|12|16|20|24|28|32|36|40|44|48|52|56|60|64|68|72|76|80|84|88|92|96)$)/;

var data = String();
bot.on('ask.comp', msg => { // Ask comp event
    let uid = msg.from.id;
    let text = msg.text;
    if (text === BUTTONS.annulla.label) return;

    if (re.test(text)) {
        if (moment(text, 'DD/MM/YYYY') > moment()) {
            logger.warn(`ask.comp futuro ${text}`, {label: uid});
            return msg.reply.text(`Non puoi inserire una data futura!`, {replyMarkup: replyMarkupOptions});
        }

        data = text;
        logger.info(`ask.comp valido text: ${text} - data: ${data}`, {label: uid});
        return msg.reply.text(`Inserisci il nome del festeggiato: `, {ask: 'nome'});
    } else {
        logger.error(`Invalid date: ${text}`, {label: uid});
        return msg.reply.text('Formato non valido! Reinserisci la data di nascita (esempio 15/12/2000): ', {ask: 'comp'});
    }
});

bot.on('ask.nome', msg => { // Ask nome event
    let uid = msg.from.id;
    let nome = msg.text;
    if (nome === BUTTONS.annulla.label) return;

    let chatId = isNew(uid).chatId;
    let sql = db.prepare("INSERT INTO birthday (chatId, date, name) VALUES (?, ?, ?);").run(String(chatId), moment(data, "DD/MM/YYYY").format("YYYY-MM-DD"), nome);

    if (sql.changes > 0) {
        logger.info(`ask.nome inserito chatId: ${chatId}, data: ${data}, nome: ${nome}`, {label: uid});
        return msg.reply.text(`Perfetto! Compleanno inserito!`, {replyMarkup: replyMarkupOptions});
    } else {
        logger.error(`ask.nome errore inserimento chatId: ${chatId}, data: ${data}, nome: ${nome}`, {label: uid});
        return msg.reply.text(`Qualcosa è andato storto! Ritenta l'inserimento premendo 'Aggiungi'`, {replyMarkup: replyMarkupOptions});
    }
});

bot.on('/lista', msg => { // Lista compleanni
    let uid = msg.from.id;

    logger.info(`/lista`, {label: uid});
    let toSend = printBirthdays(uid, false);
    return msg.reply.text(toSend, {parseMode: 'html'});
});

bot.on('/remove', msg => { // Rimuovi compleanno
    let uid = msg.from.id;
    logger.info(`/remove`, {label: uid});

    if (getBirthdays(uid).empty) return msg.reply.text("Non hai ancora inserito nessun compleanno!"); // Se nessuno memorizzato stop

    return msg.reply.text(`Quale compleanno vuoi eliminare?\n${printBirthdays(uid, true)}`, {
        ask: 'confDel',
        replyMarkup: replyMarkupAnnulla
    });
});
bot.on('ask.confDel', msg => {
    let uid = msg.from.id;
    let text = msg.text;
    if (text === BUTTONS.annulla.label) return;

    /**
     * Regex per controllo "link" di cancellazione ricevuto
     * @const {RegExp}
     * @type {RegExp}
     */
    let re = new RegExp("del_\\d+");
    if (re.test(text)) {
        let idToDelete = text.split("_");
        // La query non sembra andare a buon fine se i parametri sono nel run...
        let sql = db.prepare(`DELETE FROM birthday WHERE id = CASE WHEN (SELECT COUNT(*) FROM ids LEFT JOIN birthday ON ids.id = birthday.chatId WHERE ids.uid = ${uid} AND birthday.id = ${disarmData(idToDelete[1])}) > 0 THEN ${disarmData(idToDelete[1])} ELSE null END;`).run();
        if (sql.changes > 0) {
            logger.info(`ask.confDel eliminato text: ${text}`, {label: uid});
            return msg.reply.text(`Perfetto! Compleanno eliminato!`, {replyMarkup: replyMarkupOptions});
        } else {
            logger.info(`ask.confDel errore eliminazione text: ${text}`, {label: uid});
            return msg.reply.text(`Qualcosa è andato storto! Ritenta l'eliminazione premendo 'Rimuovi'`, {replyMarkup: replyMarkupOptions});
        }
    } else {
        logger.error(`Pattern eliminazione non valido! text: ${text}`, {label: uid});
        return msg.reply.text(`Qualcosa è andato storto! Ritenta l'eliminazione premendo 'Rimuovi'`, {replyMarkup: replyMarkupOptions});
    }
});

bot.on('/cancel', (msg) => { // Annulla tutto
    logger.info("/cancel", {label: msg.from.id});
    msg.reply.text('Azione annullata!', {replyMarkup: replyMarkupOptions})
});

bot.on('/start', (msg) => {
    let uid = msg.from.id;
    if (isNew(uid).success) {
        logger.info(`/start new`, {label: uid});
        return msg.reply.text("Benvenuto nel bot! Comandi disponibili in basso.", {replyMarkup: replyMarkupOptions});
    } else {
        logger.info(`/start`, {label: uid});
        return msg.reply.text("Felice di risentirti nel bot! Comandi disponibili in basso.", {replyMarkup: replyMarkupOptions});
    }
});

bot.start();
