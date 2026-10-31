/**
 * Entry point for the explicitly approved, non-active Worker version.
 * Ignore all inherited variables, secrets and data bindings. The version only
 * receives static assets and a synthetic, read-only VOD catalog.
 */
import worker from './index';
type Assets={fetch:(request:Request)=>Promise<Response>};
export default {fetch(request:Request,env:{ASSETS:Assets}){
 return worker.fetch(request,{ASSETS:env.ASSETS,VEO_ENV:'version-fixture',FRAME_GUARD:'deny'});
}};
