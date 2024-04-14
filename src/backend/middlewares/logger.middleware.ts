export async function loggerMiddleware(req, res, next) {
  await next()
  
  const ipFromRequest=req.connection.remoteAddress;
  const indexOfColon = ipFromRequest.lastIndexOf(':');
  const ipAddress = ipFromRequest.substring(indexOfColon+1,ipFromRequest.length);
  
  switch(res.statusCode) {
    case 200:
    case 201:
      console.info(`[Ririko BE] ${ ipAddress } [${ req.method } ${ req.path }] ${ res.statusCode }`);
      break;
    case 400:
    case 401:
    case 403:
    case 404:
    case 500:
      console.error(`[Ririko BE] ${ ipAddress } [${ req.method } ${ req.path }] ${ res.statusCode }`);
      break;
  }
  
}