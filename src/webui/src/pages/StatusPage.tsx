import { useState, useEffect } from 'react'
import type { PluginStatus } from '../types'
import { IconPower, IconClock, IconActivity, IconRefresh, IconDownload, IconDatabase, IconTerminal } from '../components/icons'

interface StatusPageProps {
    status: PluginStatus | null
    onRefresh: () => void
}

/** 将毫秒格式化为可读时长 */
function formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000)
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (days > 0) {
        return `${days}天 ${hours}小时 ${minutes}分 ${secs}秒`
    } else if (hours > 0) {
        return `${hours}小时 ${minutes}分 ${secs}秒`
    } else if (minutes > 0) {
        return `${minutes}分 ${secs}秒`
    } else {
        return `${secs}秒`
    }
}

export default function StatusPage({ status, onRefresh }: StatusPageProps) {
    const [displayUptime, setDisplayUptime] = useState<string>('-')
    // 记录上次同步时的基准信息
    const [syncInfo, setSyncInfo] = useState<{ baseUptime: number; syncTime: number } | null>(null)

    // 当 status.uptime 变化时同步基准值
    useEffect(() => {
        if (status?.uptime !== undefined && status.uptime > 0) {
            setSyncInfo({
                baseUptime: status.uptime,
                syncTime: Date.now()
            })
        }
    }, [status?.uptime])

    // 每秒更新显示
    useEffect(() => {
        if (!syncInfo) {
            setDisplayUptime('-')
            return
        }

        const updateUptime = () => {
            const elapsed = Date.now() - syncInfo.syncTime
            setDisplayUptime(formatUptime(syncInfo.baseUptime + elapsed))
        }

        updateUptime()
        const interval = setInterval(updateUptime, 1000)
        return () => clearInterval(interval)
    }, [syncInfo])

    if (!status) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">正在获取插件状态...</div>
                </div>
            </div>
        )
    }

    const { config, stats } = status

    const statCards = [
        {
            label: '插件状态',
            value: config.enabled ? '运行中' : '已停用',
            icon: <IconPower size={18} />,
            color: config.enabled ? 'text-emerald-500' : 'text-red-400',
            bg: config.enabled ? 'bg-emerald-500/10' : 'bg-red-500/10',
        },
        {
            label: '运行时长',
            value: displayUptime,
            icon: <IconClock size={18} />,
            color: 'text-primary',
            bg: 'bg-primary/10',
        },
        {
            label: '今日处理',
            value: String(stats.todayProcessed),
            icon: <IconActivity size={18} />,
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
        },
        {
            label: '累计处理',
            value: String(stats.processed),
            icon: <IconDownload size={18} />,
            color: 'text-violet-500',
            bg: 'bg-violet-500/10',
        },
    ]

    return (
        <div className="space-y-6">
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
                {statCards.map((card) => (
                    <div key={card.label} className="card p-4 hover-lift">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-gray-400 font-medium">{card.label}</span>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.bg} ${card.color} transition-transform duration-300 hover:scale-110`}>
                                {card.icon}
                            </div>
                        </div>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">{card.value}</div>
                    </div>
                ))}
            </div>

            {/* 配置概览 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-children">
                <div className="card p-5 hover-lift">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <IconTerminal size={16} className="text-gray-400" />
                            基础信息
                        </h3>
                        <button onClick={onRefresh} className="btn-ghost btn text-xs px-2.5 py-1.5">
                            <IconRefresh size={13} />
                            刷新
                        </button>
                    </div>
                    <div className="space-y-3">
                        <InfoRow label="命令前缀" value={config.commandPrefix} />
                        <InfoRow label="冷却时间" value={`${config.cooldownSeconds} 秒`} />
                        <InfoRow label="调试模式" value={config.debug ? '开启' : '关闭'} />
                        <InfoRow label="GitHub Token" value={config.useGithubToken ? '已配置' : '未使用'} />
                        <InfoRow label="临时目录" value={config.tempDir} />
                    </div>
                </div>

                <div className="card p-5 hover-lift">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                        <IconDatabase size={16} className="text-gray-400" />
                        ManifestHub 配置
                    </h3>
                    <div className="space-y-3">
                        <InfoRow label="状态" value={config.manifestHub.enabled ? '已启用' : '已禁用'} />
                        <InfoRow label="密钥来源" value={
                            config.manifestHub.depotKeySource === 'Both' ? '全部 (SAC + Sudama)' :
                                config.manifestHub.depotKeySource === 'SAC' ? 'SAC (SteamAutoCracks)' :
                                    config.manifestHub.depotKeySource === 'Sudama' ? 'Sudama (第三方 API)' :
                                        config.manifestHub.depotKeySource
                        } />
                        <InfoRow label="包含 DLC" value={config.manifestHub.includeDLC ? '是' : '否'} />
                        <InfoRow label="设置 ManifestID" value={config.manifestHub.setManifestId ? '是' : '否'} />
                        <InfoRow label="缓存过期" value={`${config.manifestHub.cacheExpireHours} 小时`} />
                    </div>
                </div>
            </div>

            {/* 仓库概览 */}
            <div className="card p-5 animate-fade-in-up hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">仓库列表概览</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm stagger-rows">
                        <thead>
                            <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                                <th className="pb-2 font-medium">仓库名称</th>
                                <th className="pb-2 font-medium">类型</th>
                                <th className="pb-2 font-medium">状态</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {config.repositories.map((repo, i) => (
                                <tr key={i}>
                                    <td className="py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">{repo.name}</td>
                                    <td className="py-2.5">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${repo.type === 'Branch' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                                            repo.type === 'Decrypted' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                                                'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                            }`}>
                                            {repo.type}
                                        </span>
                                    </td>
                                    <td className="py-2.5">
                                        <span className={`text-xs font-medium ${repo.enabled ? 'text-emerald-500' : 'text-gray-400'}`}>
                                            {repo.enabled ? '启用' : '禁用'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-xs text-gray-400">{label}</span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{value}</span>
        </div>
    )
}
