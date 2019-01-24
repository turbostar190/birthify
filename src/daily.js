const config = require('./config');
const TeleBot = require('telebot');
const bot = new TeleBot(config('telegram').token); // https://github.com/mullwar/telebot
const Database = require('better-sqlite3');
const db = new Database(config('db').path, {fileMustExist: true}); // https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
const moment = require('moment');

let today = moment().format("DD/MM/");
let res = db.prepare('SELECT ids.uid, birthday.date, birthday.name FROM ids, birthday WHERE ids.id = birthday.chatId AND date LIKE ?').all(`${today}%`);

/**
 * Ottiene gli anni data la data di nascita
 * @param {string} date data formattata in DD/MM/YYYY
 * @returns {number} età
 */
function getEta(date) {
    return moment().diff(moment(date, "DD/MM/YYYY").format("YYYY-MM-DD"), 'years', false)
}

res.forEach(function (row) {
    let eta = getEta(row.date);
    bot.sendMessage(row.uid, `${row.name} compie ${eta} anni! Auguri!`);
});
