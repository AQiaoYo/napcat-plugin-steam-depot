import type { PageId } from '../App'
import type { PluginStatus } from '../types'
import { IconSave } from './icons'

interface HeaderProps {
    title: string
    description: string
    isScrolled: boolean
    status: PluginStatus | null
    currentPage: PageId
}

export default function Header({ title, description, isScrolled, status, currentPage }: HeaderProps) {
    const isEnabled = status?.config?.enabled ?? false

    return (
        <header
            className={`
                sticky top-0 z-20 flex justify-between items-center px-4 py-4 md:px-8 md:py-5
                bg-[#f5f6f8] dark:bg-[#0e1016] transition-all duration-200
                ${isScrolled ? 'border-b border-gray-200 dark:border-gray-800' : 'border-b border-transparent'}
            `}
        >
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
                <p className="text-gray-400 text-xs mt-0.5">{description}</p>
            </div>

            {currentPage === 'config' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1a1c24] rounded-lg border border-gray-200 dark:border-gray-800">
                    <IconSave size={13} className="text-emerald-500" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">自动保存</span>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1a1c24] rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className={`status-dot ${status ? (isEnabled ? 'online' : 'offline') : ''}`} />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {status ? (isEnabled ? '运行中' : '已停用') : '连接中...'}
                    </span>
                </div>
            )}
        </header>
    )
}
