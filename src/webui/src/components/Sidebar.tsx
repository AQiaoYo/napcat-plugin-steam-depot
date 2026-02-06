import type { PageId } from '../App'
import { IconDashboard, IconSettings, IconRepo, IconGroup, IconGithub, IconSteam, IconSun } from './icons'

interface SidebarProps {
    currentPage: PageId
    onPageChange: (page: PageId) => void
}

const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: '仪表盘', icon: <IconDashboard size={18} /> },
    { id: 'config', label: '插件配置', icon: <IconSettings size={18} /> },
    { id: 'repos', label: '仓库管理', icon: <IconRepo size={18} /> },
    { id: 'groups', label: '群管理', icon: <IconGroup size={18} /> },
]

export default function Sidebar({ currentPage, onPageChange }: SidebarProps) {
    return (
        <aside className="w-60 flex-shrink-0 bg-white dark:bg-[#14161c] border-r border-gray-200 dark:border-gray-800/60 flex flex-col">
            {/* Logo */}
            <div className="px-5 py-6 flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-steam-blue rounded-lg text-steam-accent">
                    <IconSteam size={18} />
                </div>
                <div>
                    <h1 className="font-bold text-sm leading-tight text-gray-900 dark:text-white">Steam Depot</h1>
                    <p className="text-[10px] text-gray-400 font-medium tracking-wider">DOWNLOADER</p>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
                {menuItems.map((item) => (
                    <div
                        key={item.id}
                        className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
                        onClick={() => onPageChange(item.id)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="px-3 pb-2">
                <a
                    href="https://github.com/AQiaoYo/napcat-plugin-steam-depot/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sidebar-item no-underline"
                >
                    <IconGithub size={18} />
                    <span>反馈问题</span>
                </a>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800/60">
                <div className="flex items-center justify-center w-full py-2 rounded-lg text-gray-400 bg-gray-50 dark:bg-white/[0.03] cursor-default text-xs gap-2">
                    <IconSun size={14} className="opacity-60" />
                    <span>跟随系统主题</span>
                </div>
            </div>
        </aside>
    )
}
