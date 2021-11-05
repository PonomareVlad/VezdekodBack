import Router from 'router'
import query from 'micro-query'
import {send} from 'micro-with-es'
import formidable from 'formidable'
import finalhandler from 'finalhandler'
import calculateAspectRatio from 'calculate-aspect-ratio'
import {readFile} from "fs/promises"
import handler from 'serve-handler'
import mysql from 'mysql2/promise'
import imghash from 'imghash'
import {config} from 'dotenv'
import sharp from 'sharp'

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
    const {hash, aspectRatio} = parseId(req.query.id)
    if (!hash || !aspectRatio) return res.end('Bad ID')
    const connection = await mysql.createConnection(mysqlCredentials);
    const [rows] = await connection.execute('SELECT * FROM `images` WHERE hash=? AND aspect_ratio=?', [hash, aspectRatio]);
    await connection.end()
    console.debug({rows});
    if (!rows || !rows.length) return res.end('Not found')
    const target = rows.shift();
    res.setHeader('Content-Type', target.mimetype);
    const scale = req.query.scale ? parseFloat(req.query.scale) : 1.0;
    if (scale !== 1) return send(res, 200, await sharp(target.image).metadata().then(({width}) => sharp(target.image).resize(Math.round(width * scale)).toBuffer()));
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
    if (!files || !files.image || files.image.mimetype !== 'image/jpeg') return res.end('Not a JPEG image');
    const connection = await mysql.createConnection(mysqlCredentials);
    const image = await readFile(files.image.filepath);
    const hash = await imghash.hash(image);
    const metadata = await sharp(image).metadata();
    const aspectRatio = calculateAspectRatio.default(metadata.width, metadata.height)
    delete metadata.icc;
    const [similarImages] = await connection.execute('SELECT * FROM `images` WHERE hash=? AND aspect_ratio=? AND width>=? AND height>=?',
        [hash, aspectRatio, metadata.width, metadata.height]);
    const [replaceableImages] = await connection.execute('SELECT * FROM `images` WHERE hash=? AND aspect_ratio=?', [hash, aspectRatio]);
    console.debug({similarImages, replaceableImages})
    if (similarImages && similarImages.length) {
        await connection.end()
        return send(res, 200, {id: getId(hash, aspectRatio)});
    }
    if (replaceableImages && replaceableImages.length) {
        const result = await connection.execute('UPDATE `images` SET width=?, height=?, metadata=?, image=? WHERE hash=? AND aspect_ratio=?',
            [metadata.width, metadata.height, JSON.stringify(metadata), image, hash, aspectRatio]);
        await connection.end()
        console.debug({result});
        return send(res, 200, {id: getId(hash, aspectRatio)})
    }
    const result = await connection.execute('INSERT INTO `images` SET mimetype=?, hash=?, width=?, height=?, aspect_ratio=?, metadata=?, image=?',
        [files.image.mimetype, hash, metadata.width, metadata.height, aspectRatio, JSON.stringify(metadata), image]);
    await connection.end()
    console.debug({result});
    return send(res, 200, {id: getId(hash, aspectRatio)})
})

const getId = (hash, aspectRatio) => `${hash}_${aspectRatio}`
const parseId = id => {
    const [hash, aspectRatio] = id.split('_')
    return {hash, aspectRatio}
}

export default async (req, res) => await router(req, res, finalhandler(req, res))
