// @refresh reload
import { mount, StartClient } from '@solidjs/start/client';

const app = mount(() => <StartClient />, document.getElementById('app')!);

export default app;
