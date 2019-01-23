require('dotenv').config();
const TeleBot = require('telebot');
const Database = require('better-sqlite3');
const db = new Database('src/db.sqlite3', {fileMustExist: true}); // https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
// https://github.com/mullwar/telebot/blob/master/examples/plugin-askUser.js
// https://github.com/mullwar/telebot/blob/master/examples/plugin-namedButtons.js
const moment = require('moment');

const BUTTONS = {
    add: {
        label: 'Aggiungi',
        command: '/add'
    },
    remove: {
        label: 'Rimuovi',
        command: '/remove'
    },
    lista: {
        label: 'Lista',
        command: '/lista'
    },
    annulla: {
        label: 'Annulla',
        command: '/cancel'
    }
};
const bot = new TeleBot({
    token: process.env.TOKEN,
    usePlugins: ['askUser', 'namedButtons'],
    pluginConfig: {
        namedButtons: {
            buttons: BUTTONS
        }
    }
}); // https://github.com/mullwar/telebot

function isNew(id) {
    let idUser = String(id);
    let row = db.prepare('SELECT id, COUNT(*) AS rep FROM ids WHERE uid=?').get(idUser);
    // console.log(row);

    if (row.rep == 0) {
        let sql = db.prepare("INSERT INTO ids (uid) VALUES (?)").run(idUser);
        // console.log(sql);
        return {success: true, chatId: sql.lastInsertRowid};
    } else {
        return {success: false, chatId: parseInt(row.id)};
    }
}

function getEta(date) {
    return moment().diff(moment(date, "DD/MM/YYYY").format("YYYY-MM-DD"), 'years', false)
}

function getIsEmptyList(uid) {
    let res = db.prepare('SELECT * FROM ids, birthday WHERE ids.id = birthday.chatId AND ids.uid = ?').all(String(uid));
    return res.length === 0;
}

function getLista(uid, elimina) {
    let res = db.prepare('SELECT * FROM ids, birthday WHERE ids.id = birthday.chatId AND ids.uid = ?').all(String(uid));
    let send = "";
    if (res.length == 0) {
        send = "Non hai ancora inserito nessun compleanno!";
        return send;
    }

    if (!elimina) { // Lista per bottone 'Lista'
        res.forEach(function (row) {
            send += `${row.name}: ${row.date} - ${getEta(row.date)} anni
`;
        });
    } else {
        res.forEach(function (row) { // Lista per bottone 'Rimuovi'
            send += `${row.name} -> ${row.date} - /del_${row.id}
`;
        });
    }

    return send;
}

// Aggiunta compleanno
bot.on('/add', msg => {
    let replyMarkup = bot.keyboard([ // Solo bottone 'annulla'
        [BUTTONS.annulla.label]
    ], {resize: true});

    return bot.sendMessage(msg.from.id, "Inserisci la data di nascita (gg/mm/aaaa): ", {ask: 'comp', replyMarkup: replyMarkup});
});
const re = /(^(((0[1-9]|1[0-9]|2[0-8])[\/](0[1-9]|1[012]))|((29|30|31)[\/](0[13578]|1[02]))|((29|30)[\/](0[4,6,9]|11)))[\/](19|[2-9][0-9])\d\d$)|(^29[\/]02[\/](19|[2-9][0-9])(00|04|08|12|16|20|24|28|32|36|40|44|48|52|56|60|64|68|72|76|80|84|88|92|96)$)/;
var data = "";
// Ask comp event
bot.on('ask.comp', msg => {
    // let id = msg.from.id;
    let text = msg.text;
    if (text == "Annulla") return;

    if (re.test(text)) {
        // ROW['chatId'] = id;
        data = text;
        return msg.reply.text(`Inserisci il nome del festeggiato: `, {ask: 'nome'});
    } else {
        return msg.reply.text('Formato non valido! Reinserisci la data di nascita (esempio 15/12/2000): ', {ask: 'comp'});
    }
});

// Ask nome event
bot.on('ask.nome', msg => {
    const nome = msg.text;
    if (nome == "Annulla") return;

    let chatId = isNew(msg.from.id).chatId;
    let sql = db.prepare("INSERT INTO birthday (chatId, date, name) VALUES (?, ?, ?)").run(String(chatId), data, nome);

    if (sql.changes > 0) {
        return msg.reply.text(`Perfetto! Compleanno inserito!`, {replyMarkup: replyMarkupOptions});
    } else {
        return msg.reply.text(`Qualcosa è andato storto! Ritenta l'inserimento premendo 'Aggiungi'`, {replyMarkup: replyMarkupOptions});
    }
});

// Lista compleanni
bot.on('/lista', msg => {
    let send = getLista(msg.from.id);
    msg.reply.text(send, {parseMode: 'html'});
});

// Rimuovi compleanno
bot.on('/remove', msg => {
    let replyMarkup = bot.keyboard([ // Solo bottone 'annulla'
        [BUTTONS.annulla.label]
    ], {resize: true});

    if (getIsEmptyList(msg.from.id)) return msg.reply.text("Non hai ancora inserito nessun compleanno");

    return msg.reply.text(`Quale compleanno vuoi eliminare?

${getLista(msg.from.id, true)}`, {ask: 'confDel', replyMarkup: replyMarkup});

});
bot.on('ask.confDel', msg => {
    let text = msg.text;
    if (text == "Annulla") return;

    const re = new RegExp("del_\\d+");
    if (re.test(text)) {
        let idToDelete = text.split("_");

        let sql = db.prepare('DELETE FROM birthday WHERE id=?').run(idToDelete[1]);
        if (sql.changes > 0) {
            return msg.reply.text(`Perfetto! Compleanno eliminato!`, {replyMarkup: replyMarkupOptions});
        } else {
            return msg.reply.text(`Qualcosa è andato storto! Ritenta l'eliminazione premendo 'Aggiungi'`, {replyMarkup: replyMarkupOptions});
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