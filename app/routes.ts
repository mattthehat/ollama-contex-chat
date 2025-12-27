import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
    index('routes/home.tsx'),
    route('chats', 'routes/chats/index.tsx'),
    route('chats/new', 'routes/chats/new.tsx'),
    route('chats/:chatId', 'routes/chats/detail.tsx'),
    route('library', 'routes/library/index.tsx'),
    route('library/new', 'routes/library/new.tsx'),
    route('library/:uuid', 'routes/library/view.tsx'),
] satisfies RouteConfig;
