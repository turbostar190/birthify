const config = require('../config');
const TeleBot = require('telebot');
const bot = new TeleBot(config('telegram').token); // https://github.com/mullwar/telebot
const Database = require('better-sqlite3');
const db = new Database(config('db').path, {fileMustExist: true}); // https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
const moment = require('moment');

let today = moment().format("MM-DD");
let res = db.prepare('SELECT ids.uid, birthday.date, birthday.name FROM ids, birthday WHERE ids.id = birthday.chatId AND date LIKE ?;').all(`____-${today}`);

/**
 * Ottiene gli anni data la data di nascita
 * @param {string} date data formattata in YYYY-MM-DD
 * @returns {number} età
 */
function getEta(date) {
    return moment().diff(date, 'years', false)
}

res.forEach(function (row) {
    let eta = getEta(row.date);
    let anno = {sing: "anno", plur: "anni"};
    return bot.sendMessage(row.uid, `🎂 ${row.name} compie ${eta} ${eta == 1 ? anno.sing : anno.plur}! Auguri!`);
});
