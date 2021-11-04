import Router from 'router'
import formidable from 'formidable'
import finalhandler from 'finalhandler'
import {readFile} from "fs/promises";

const router = Router().get('/get', async (req, res) => {
    return await res.send('Get')
}).post('/upload', async (req, res) => {
    const form = formidable({});
    const {fields, files} = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            console.debug({fields, files});
            resolve({fields, files});
        });
    });
    if (!files || !files.image) return await res.send('No image');
    res.setHeader('Content-Type', files.image.mimetype);
    return await res.send(await readFile(files.image.filepath))
})

export default async (req, res) => await router(req, res, finalhandler(req, res))
