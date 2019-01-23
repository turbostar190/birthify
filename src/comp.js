require('dotenv').config();
const TeleBot = require('telebot');
const bot = new TeleBot(process.env.TOKEN); // https://github.com/mullwar/telebot
const Database = require('better-sqlite3');
const db = new Database('src/db.sqlite3', {fileMustExist: true}); // https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md
const moment = require('moment');

let today = moment().format("DD/MM/");
let res = db.prepare('SELECT uid, date, name FROM ids, birthday WHERE date LIKE ?').all(`${today}%`);

res.forEach(function (row) {
    let eta = moment().diff(moment(row.date, "DD/MM/YYYY").format("YYYY-MM-DD"), 'years', false);
    // console.log(eta);
    bot.sendMessage(row.uid, `${row.name} compie ${eta} anni! Auguri!`);
});
