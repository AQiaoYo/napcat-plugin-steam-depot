import { useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig } from '../types'
import { IconKey, IconDatabase, IconTerminal } from '../components/icons'

export default function ConfigPage() {
    const [config, setConfig] = useState<PluginConfig | null>(null)
    const [saving, setSaving] = useState(false)

    const fetchConfig = useCallback(async () => {
        try {
            const res = await noAuthFetch<PluginConfig>('/config')
            if (res.code === 0 && res.data) setConfig(res.data)
        } catch { showToast('获取配置失败', 'error') }
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    const saveConfig = useCallback(async (update: Partial<PluginConfig>) => {
        if (!config) return
        setSaving(true)
        try {
            const newConfig = { ...config, ...update }
            await noAuthFetch('/config', {
                method: 'POST',
                body: JSON.stringify(newConfig),
            })
            setConfig(newConfig)
            showToast('配置已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSaving(false)
        }
    }, [config])

    const updateField = <K extends keyof PluginConfig>(key: K, value: PluginConfig[K]) => {
        if (!config) return
        const updated = { ...config, [key]: value }
        setConfig(updated)
        saveConfig({ [key]: value })
    }

    const updateManifestHub = (key: string, value: unknown) => {
        if (!config) return
        const mh = { ...config.manifestHub, [key]: value }
        const updated = { ...config, manifestHub: mh }
        setConfig(updated)
        saveConfig({ manifestHub: mh })
    }

    if (!config) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400 text-sm">加载配置中...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* 基础配置 */}
            <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconTerminal size={16} className="text-gray-400" />
                    基础配置
                </h3>
                <div className="space-y-5">
                    <ToggleRow
                        label="启用插件"
                        desc="全局开关，关闭后不响应任何命令"
                        checked={config.enabled}
                        onChange={(v) => updateField('enabled', v)}
                    />
                    <ToggleRow
                        label="调试模式"
                        desc="启用后输出详细日志到控制台"
                        checked={config.debug}
                        onChange={(v) => updateField('debug', v)}
                    />
                    <InputRow
                        label="命令前缀"
                        desc="触发下载命令的前缀"
                        value={config.commandPrefix}
                        onChange={(v) => updateField('commandPrefix', v)}
                    />
                    <InputRow
                        label="冷却时间 (秒)"
                        desc="同一 AppID 请求冷却时间，0 表示不限制"
                        value={String(config.cooldownSeconds)}
                        type="number"
                        onChange={(v) => updateField('cooldownSeconds', Number(v) || 0)}
                    />
                    <InputRow
                        label="临时目录"
                        desc="下载文件的临时存储目录名"
                        value={config.tempDir}
                        onChange={(v) => updateField('tempDir', v)}
                    />
                </div>
            </div>

            {/* GitHub Token */}
            <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconKey size={16} className="text-gray-400" />
                    GitHub Token
                </h3>
                <div className="space-y-5">
                    <ToggleRow
                        label="使用 GitHub Token"
                        desc="启用后使用 Token 提高 API 速率限制"
                        checked={config.useGithubToken}
                        onChange={(v) => updateField('useGithubToken', v)}
                    />
                    {config.useGithubToken && (
                        <InputRow
                            label="Token"
                            desc="GitHub Personal Access Token"
                            value={config.githubToken || ''}
                            type="password"
                            onChange={(v) => updateField('githubToken', v)}
                        />
                    )}
                </div>
            </div>

            {/* ManifestHub */}
            <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconDatabase size={16} className="text-gray-400" />
                    ManifestHub 配置
                </h3>
                <div className="space-y-5">
                    <ToggleRow
                        label="启用 ManifestHub"
                        desc="使用 ManifestHub 数据源获取 Depot 信息"
                        checked={config.manifestHub.enabled}
                        onChange={(v) => updateManifestHub('enabled', v)}
                    />
                    <SelectRow
                        label="密钥来源"
                        desc="DepotKey 数据源选择"
                        value={config.manifestHub.depotKeySource}
                        options={[
                            { value: 'SAC', label: 'SAC (SteamAutoCracks)' },
                            { value: 'Sudama', label: 'Sudama (第三方 API)' },
                        ]}
                        onChange={(v) => updateManifestHub('depotKeySource', v)}
                    />
                    <ToggleRow
                        label="包含 DLC"
                        desc="下载时是否包含 DLC 内容"
                        checked={config.manifestHub.includeDLC}
                        onChange={(v) => updateManifestHub('includeDLC', v)}
                    />
                    <ToggleRow
                        label="设置 ManifestID"
                        desc="在 Lua 中设置固定 ManifestID"
                        checked={config.manifestHub.setManifestId}
                        onChange={(v) => updateManifestHub('setManifestId', v)}
                    />
                    <InputRow
                        label="缓存过期 (小时)"
                        desc="DepotKeys 缓存过期时间，0 表示不缓存"
                        value={String(config.manifestHub.cacheExpireHours)}
                        type="number"
                        onChange={(v) => updateManifestHub('cacheExpireHours', Number(v) || 0)}
                    />
                </div>
            </div>

            {saving && (
                <div className="fixed bottom-4 right-4 bg-brand-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
                    保存中...
                </div>
            )}
        </div>
    )
}

/* ---- 子组件 ---- */

function ToggleRow({ label, desc, checked, onChange }: {
    label: string; desc: string; checked: boolean; onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </div>
            <label className="toggle">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <div className="slider" />
            </label>
        </div>
    )
}

function InputRow({ label, desc, value, type = 'text', onChange }: {
    label: string; desc: string; value: string; type?: string; onChange: (v: string) => void
}) {
    const [local, setLocal] = useState(value)
    useEffect(() => { setLocal(value) }, [value])

    const handleBlur = () => {
        if (local !== value) onChange(local)
    }

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <input
                className="input-field"
                type={type}
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
            />
        </div>
    )
}

function SelectRow({ label, desc, value, options, onChange }: {
    label: string; desc: string; value: string
    options: { value: string; label: string }[]
    onChange: (v: string) => void
}) {
    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <select
                className="input-field"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    )
}
