export default async (req, res) => res.json({
    body: req.body,
    query: req.query,
    cookies: req.cookies,
    headers: req.headers,
    versions: process.versions
})
