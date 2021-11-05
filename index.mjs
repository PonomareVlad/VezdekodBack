import Router from 'router'
import query from 'micro-query'
import {send} from 'micro-with-es'
import formidable from 'formidable'
import finalhandler from 'finalhandler'
import {readFile} from "fs/promises"
import handler from 'serve-handler'
import mysql from 'mysql2/promise'
import {config} from 'dotenv'

config();
const mysqlCredentials = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB
}

const router = Router().get('/', handler).get('/get', async (req, res) => {
    if (!req.query) req.query = query(req)
    if (!req.query.id) return res.end('No parameter')
    const connection = await mysql.createConnection(mysqlCredentials);
    const [rows, fields] = await connection.execute('SELECT * FROM `images` WHERE id=?', [parseInt(req.query.id)]);
    await connection.end()
    console.debug({rows});
    if (!rows || !rows.length) return res.end('Not found')
    const target = rows.shift();
    res.setHeader('Content-Type', target.mimetype);
    return send(res, 200, target.image)
}).post('/upload', async (req, res) => {
    const form = formidable({});
    const {fields, files} = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            console.debug({fields, files});
            resolve({fields, files});
        });
    });
    if (!files || !files.image) return res.end('No image');
    const connection = await mysql.createConnection(mysqlCredentials);
    const image = await readFile(files.image.filepath);
    const result = await connection.execute('INSERT INTO `images` SET image=?, mimetype=?', [image, files.image.mimetype]);
    await connection.end()
    console.debug(result);
    return send(res, 200, {id: result.shift().insertId})
})

export default async (req, res) => await router(req, res, finalhandler(req, res))
