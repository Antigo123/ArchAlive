import type { Connect, Plugin } from 'vite';
import { createTutorHandler, type TutorHandlerOptions } from './tutorHandler.ts';

/**
 * Serves the tutor's API from the Vite dev and preview servers, so running locally needs one
 * process. It doesn't exist in the production build, so the deployed static site has no endpoint
 * that could spend the API key.
 */
export function tutorApi(options: TutorHandlerOptions): Plugin {
    const handle = createTutorHandler(options);
    const middleware: Connect.NextHandleFunction = (req, res, next) => {
        handle(req, res).then(handled => {
            if (!handled) next();
        }).catch(next);
    };
    return {
        name: 'archalive-tutor-api',
        configureServer(server) {
            server.middlewares.use(middleware);
        },
        configurePreviewServer(server) {
            server.middlewares.use(middleware);
        },
    };
}
