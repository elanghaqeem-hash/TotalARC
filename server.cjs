const http = require('http');
const next = require('next');

const port = Number(process.env.PORT || 3000);
const hostname = '0.0.0.0';

const app = next({
  dev: false,
  hostname,
  port,
});

const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => handle(req, res));

    server.listen(port, hostname, () => {
      console.log(`TotalARC listening on port ${port}`);
    });

    const shutdown = () => {
      server.close(() => process.exit(0));
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch((error) => {
    console.error('Failed to start TotalARC:', error);
    process.exit(1);
  });
