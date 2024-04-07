export async function loggerMiddleware(req, res, next) {
  await next()
  switch(res.statusCode) {
    case 200:
    case 201:
      console.info(`[Ririko BE] ${ req.socket.remoteAddress } [${ req.method } ${ req.path }] ${ res.statusCode }`);
      break;
    case 400:
    case 401:
    case 403:
    case 404:
    case 500:
      console.error(`[Ririko BE] ${ req.socket.remoteAddress } [${ req.method } ${ req.path }] ${ res.statusCode }`);
      break;
  }
  
}