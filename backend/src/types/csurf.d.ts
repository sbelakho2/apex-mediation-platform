declare module 'csurf' {
	import { RequestHandler } from 'express';

	type CsurfOptions = Record<string, unknown> | undefined;

	function csurf(options?: CsurfOptions): RequestHandler;

	export default csurf;
}
