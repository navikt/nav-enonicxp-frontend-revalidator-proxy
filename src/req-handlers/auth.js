const authHandler = (req, res, next) => {
    if (req.headers.secret !== process.env.SERVICE_SECRET) {
        console.warn(`Auth failed on ${req.url}`);
        return res.status(401).send('Not authorized');
    }

    next();
};

module.exports = { authHandler };
