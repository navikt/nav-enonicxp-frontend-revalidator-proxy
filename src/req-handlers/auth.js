const authMiddleware = (req, res, next) => {
    if (req.headers.secret !== process.env.SERVICE_SECRET) {
        console.warn(
            `Auth failed on ${req.url} - ${req.headers.secret?.substr(
                0,
                4
            )} - ${process.env.SERVICE_SECRET?.substr(0, 4)}`
        );
        return res.status(401).send('Not authorized');
    }

    next();
};

module.exports = { authMiddleware };
