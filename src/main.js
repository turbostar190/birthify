const config = require('../config');
const TeleBot = require('telebot');
const Database = require('better-sqlite3');
const db = new Database(config('db').path, {fileMustExist: true}); // https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
const moment = require('moment');

const BUTTONS = {
    add: {
        label: '\u2795 Aggiungi',
        command: '/add'
    },
    remove: {
        label: '🗑️ Rimuovi', // Lì dentro c'è una emoji...
        command: '/remove'
    },
    lista: {
        label: '☰ Lista',
        command: '/lista'
    },
    annulla: {
        label: '\u274C Annulla',
        command: '/cancel'
    }
};
const bot = new TeleBot({
    token: config('telegram').token,
    usePlugins: ['askUser', 'namedButtons'],
    pluginConfig: {
        namedButtons: {
            buttons: BUTTONS
        }
    }
}); // https://github.com/mullwar/telebot

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
 * Restituisce la query dei compleanni salvati da quell'utente
 * @param {number} uid uid della chat/utente
 * @returns {{ empty: boolean, res: Object}}
 */
function getBirthdays(uid) {
    let res = db.prepare('SELECT * FROM ids, birthday WHERE ids.id = birthday.chatId AND ids.uid = ? ORDER BY birthday.date ASC;').all(String(uid));
    return {empty: res.length === 0, res: res};
}

/**
 * Restituisce una stringa formattata con la lista dei compleanni salvati ed eventuale link per cancellazione
 * @param {number} uid uid della chat/utente
 * @param {boolean} elimina true per includere link di cancellazione
 * @returns {string}
 */
function printBirthdays(uid, elimina) {
    let send = "";
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
                send += `${row.name}: ${moment(row.date, "YYYY-MM-DD").format("DD/MM/YYYY")} - ${getEta(row.date)} anni\n`;
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

// Aggiunta compleanno
bot.on('/add', msg => {
    let replyMarkup = bot.keyboard([ // Solo bottone 'annulla'
        [BUTTONS.annulla.label]
    ], {resize: true});

    return bot.sendMessage(msg.from.id, "Inserisci la data di nascita (gg/mm/aaaa): ", {
        ask: 'comp',
        replyMarkup: replyMarkup
    });
});

/**
 * Regex per data in formato GG/MM/AAAA
 * @const {RegExp}
 * @type {RegExp}
 */
const re = /(^(((0[1-9]|1[0-9]|2[0-8])[\/](0[1-9]|1[012]))|((29|30|31)[\/](0[13578]|1[02]))|((29|30)[\/](0[4,6,9]|11)))[\/](19|[2-9][0-9])\d\d$)|(^29[\/]02[\/](19|[2-9][0-9])(00|04|08|12|16|20|24|28|32|36|40|44|48|52|56|60|64|68|72|76|80|84|88|92|96)$)/;

let data = "";
// Ask comp event
bot.on('ask.comp', msg => {
    let text = msg.text;
    if (text === BUTTONS.annulla.label) return;

    if (re.test(text)) {
        data = text;
        return msg.reply.text(`Inserisci il nome del festeggiato: `, {ask: 'nome'});
    } else {
        return msg.reply.text('Formato non valido! Reinserisci la data di nascita (esempio 15/12/2000): ', {ask: 'comp'});
    }
});

// Ask nome event
bot.on('ask.nome', msg => {
    const nome = msg.text;
    if (nome === BUTTONS.annulla.label) return;

    let chatId = isNew(msg.from.id).chatId;
    let sql = db.prepare("INSERT INTO birthday (chatId, date, name) VALUES (?, ?, ?);").run(String(chatId), moment(data, "DD/MM/YYYY").format("YYYY-MM-DD"), nome);

    if (sql.changes > 0) {
        return msg.reply.text(`Perfetto! Compleanno inserito!`, {replyMarkup: replyMarkupOptions});
    } else {
        return msg.reply.text(`Qualcosa è andato storto! Ritenta l'inserimento premendo 'Aggiungi'`, {replyMarkup: replyMarkupOptions});
    }
});

// Lista compleanni
bot.on('/lista', msg => {
    let toSend = printBirthdays(msg.from.id, false);
    msg.reply.text(toSend, {parseMode: 'html'});
});

// Rimuovi compleanno
bot.on('/remove', msg => {
    let replyMarkup = bot.keyboard([ // Solo bottone 'annulla'
        [BUTTONS.annulla.label]
    ], {resize: true});

    if (getBirthdays(msg.from.id).empty) return msg.reply.text("Non hai ancora inserito nessun compleanno!"); // Se nessuno memorizzato stop

    return msg.reply.text(`Quale compleanno vuoi eliminare?\n${printBirthdays(msg.from.id, true)}`, {
        ask: 'confDel',
        replyMarkup: replyMarkup
    });
});
bot.on('ask.confDel', msg => {
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
        let sql = db.prepare(`DELETE FROM birthday WHERE id = CASE WHEN (SELECT COUNT(*) FROM ids LEFT JOIN birthday ON ids.id = birthday.chatId WHERE ids.uid = ${msg.from.id} AND birthday.id = ${disarmData(idToDelete[1])}) > 0 THEN ${disarmData(idToDelete[1])} ELSE null END;`).run();
        if (sql.changes > 0) {
            return msg.reply.text(`Perfetto! Compleanno eliminato!`, {replyMarkup: replyMarkupOptions});
        } else {
            return msg.reply.text(`Qualcosa è andato storto! Ritenta l'eliminazione premendo 'Rimuovi'`, {replyMarkup: replyMarkupOptions});
        }
    }
});

// Annulla tutto
bot.on('/cancel', (msg) => msg.reply.text('Azione annullata!', {replyMarkup: replyMarkupOptions})); // Annulla tutto

const replyMarkupOptions = bot.keyboard([ // Tastiera di default con i tre bottoni
    [BUTTONS.add.label, BUTTONS.lista.label, BUTTONS.remove.label]
], {resize: true});
bot.on('/start', (msg) => {
    if (isNew(msg.from.id).success) {
        msg.reply.text("Benvenuto nel bot! Comandi disponibili in basso.", {replyMarkupOptions});
    } else {
        msg.reply.text("Felice di risentirti nel bot! Comandi disponibili in basso.", {replyMarkupOptions});
    }
});

bot.start();
