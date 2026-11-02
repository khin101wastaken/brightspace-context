import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {cacheDirectory} from '../companion/paths.js';
import {LocalLibrary} from './library.js';
import {createMcpServer} from './server.js';
const library=new LocalLibrary(cacheDirectory(),Number(process.env.BRIGHTSPACE_COMPANION_PORT || 47653));
const server=createMcpServer(library);
await server.connect(new StdioServerTransport());
