const { app, logger } = require('./app');

const port = Number(process.env.PORT || 3004);

const server = app.listen(port, () => {
  logger.info('Personalization Service started', { port, url: `http://localhost:${port}` });
});

const shutdown = () => {
  logger.info('Shutdown signal received, closing gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
