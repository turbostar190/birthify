# birthify

Source code of the Italian bot Birthify, available on [Telegram](https://t.me/birthdayNotify_bot).

### Configuration

Create the SQLite3 database using the code given in `src/create_db.sql` and place it in `src` folder. A simple utility to create the db is [sqlitestudio](https://sqlitestudio.pl).

Then, a `config.json.example` file is placed in `config` directory and it must be renamed `config.json` after changing values according to the following table:

| Key | Required | Description |
| --- | --- | --- |
| `telegram.token` | Yes | The [Telegram Bot API](https://core.telegram.org/bots/api) bot token |
| `db.path` | Yes| SQLite3 database filename from root directory (i.e. `src/db.sqlite3`) |

### How to run it

Make sure Node is installed, then from the ***root directory*** run 
```bash
npm run start
```

To use the daily notifier add the commmand 
```bash
npm run daily
```
to [Crontab](https://www.adminschoice.com/crontab-quick-reference).

***N.B. Without any other configurations, Crontab uses absolute path from `$HOME`!***