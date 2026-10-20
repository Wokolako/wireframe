// Keep the existing authorization, body limits, cookies and webhook verification
// inside Next's Node API runtime. Import lazily: builds must not connect to the DB.
export const config = {api:{bodyParser:false,externalResolver:true}};

export default async function handler(req,res) {
  const backendEnabled=process.env.USE_BACKEND??process.env.NEXT_PUBLIC_USE_BACKEND;
  if(backendEnabled!=='true')return res.status(404).json({error:'API endpoint not found.'});
  const {app} = await import('../../server/index.mjs');
  // This adapter is the one proxy hop between the browser and Express. Trusting
  // it lets express-rate-limit use the client address supplied by Next instead
  // of rejecting Next's X-Forwarded-For header. An explicit deployment setting
  // still wins when the application is behind additional trusted proxies.
  if(app.get('trust proxy')===false)app.set('trust proxy',1);
  // Next's route params are not API query parameters. Express parses the URL.
  delete req.query;
  // Prefer Express response helpers to Next's own JSON/send implementations.
  for(const key of ['status','json','send','redirect'])delete res[key];
  await new Promise((resolve,reject) => {
    const done = () => {res.off('error',failed);resolve();};
    const failed = error => {res.off('finish',done);res.off('close',done);reject(error);};
    res.once('finish',done);res.once('close',done);res.once('error',failed);
    app(req,res);
  });
}
