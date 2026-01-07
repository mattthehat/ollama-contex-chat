import { Link, NavLink } from 'react-router';

export default function Header() {
    const routes = [
        {
            name: 'Models',
            href: '/models',
        },
        {
            name: 'Chats',
            href: '/chats',
        },
        {
            name: 'Library',
            href: '/library',
        },
    ];

    return (
        <header className="bg-white dark:bg-gray-800">
            <div className="container mx-auto flex items-center justify-between h-16 px-4">
                <Link
                    to="/"
                    className="text-2xl font-bold text-black dark:text-white"
                >
                    Ollama Chat
                </Link>
                <nav>
                    <ul className="flex space-x-4">
                        {routes.map((route) => (
                            <li
                                key={route.href}
                                className="border-b-2 border-transparent hover:border-blue-500 pb-1"
                            >
                                <NavLink
                                    to={route.href}
                                    className={({ isActive, isPending }) =>
                                        isPending
                                            ? 'bg-yellow-300 '
                                            : isActive
                                              ? 'font-bold'
                                              : ''
                                    }
                                >
                                    {route.name}
                                </NavLink>
                            </li>
                        ))}
                        <li>
                            <a
                                href="/chats/new"
                                className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                                New Chat
                            </a>
                        </li>
                    </ul>
                </nav>
            </div>
        </header>
    );
}
