const authMiddleware = (req, res, next) => {
    if (req.headers.secret !== process.env.SERVICE_SECRET) {
        console.warn(
            `Auth failed on ${req.url} - ${req.headers.secret?.substr(
                5,
                12
            )} (${
                req.headers.secret.length
            }) - ${process.env.SERVICE_SECRET?.substr(5, 12)} (${
                process.env.SERVICE_SECRET.length
            })`
        );
        return res.status(401).send('Not authorized');
    }

    next();
};

module.exports = { authMiddleware };
