import { useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig, RepoConfig } from '../types'
import { IconPlus, IconTrash, IconEdit, IconCheck, IconX } from '../components/icons'

export default function ReposPage() {
    const [config, setConfig] = useState<PluginConfig | null>(null)
    const [editIdx, setEditIdx] = useState<number | null>(null)
    const [editForm, setEditForm] = useState<RepoConfig>({ name: '', type: 'Decrypted', enabled: true })
    const [adding, setAdding] = useState(false)
    const [newForm, setNewForm] = useState<RepoConfig>({ name: '', type: 'Decrypted', enabled: true })

    const fetchConfig = useCallback(async () => {
        try {
            const res = await noAuthFetch<PluginConfig>('/config')
            if (res.code === 0 && res.data) setConfig(res.data)
        } catch { showToast('获取配置失败', 'error') }
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    const saveRepos = async (repos: RepoConfig[]) => {
        try {
            await noAuthFetch('/config', {
                method: 'POST',
                body: JSON.stringify({ ...config, repositories: repos }),
            })
            setConfig(prev => prev ? { ...prev, repositories: repos } : prev)
            showToast('仓库配置已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        }
    }

    const toggleRepo = (idx: number) => {
        if (!config) return
        const repos = [...config.repositories]
        repos[idx] = { ...repos[idx], enabled: !repos[idx].enabled }
        saveRepos(repos)
    }

    const deleteRepo = (idx: number) => {
        if (!config) return
        const repos = config.repositories.filter((_, i) => i !== idx)
        saveRepos(repos)
    }

    const startEdit = (idx: number) => {
        if (!config) return
        setEditIdx(idx)
        setEditForm({ ...config.repositories[idx] })
    }

    const confirmEdit = () => {
        if (!config || editIdx === null) return
        if (!editForm.name.trim()) {
            showToast('仓库名称不能为空', 'warning')
            return
        }
        const repos = [...config.repositories]
        repos[editIdx] = { ...editForm }
        saveRepos(repos)
        setEditIdx(null)
    }

    const addRepo = () => {
        if (!config) return
        if (!newForm.name.trim()) {
            showToast('仓库名称不能为空', 'warning')
            return
        }
        if (config.repositories.some(r => r.name === newForm.name.trim())) {
            showToast('仓库已存在', 'warning')
            return
        }
        const repos = [...config.repositories, { ...newForm, name: newForm.name.trim() }]
        saveRepos(repos)
        setAdding(false)
        setNewForm({ name: '', type: 'Decrypted', enabled: true })
    }

    if (!config) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400 text-sm">加载中...</div>
            </div>
        )
    }

    const repos = config.repositories

    return (
        <div className="space-y-4">
            {/* 操作栏 */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                    共 {repos.length} 个仓库，{repos.filter(r => r.enabled).length} 个已启用
                </p>
                <button className="btn btn-primary text-xs" onClick={() => setAdding(true)}>
                    <IconPlus size={14} />
                    添加仓库
                </button>
            </div>

            {/* 添加表单 */}
            {adding && (
                <div className="card p-4 border-brand-500/30 border-dashed">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">添加新仓库</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                            className="input-field"
                            placeholder="owner/repo"
                            value={newForm.name}
                            onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                        />
                        <select
                            className="input-field"
                            value={newForm.type}
                            onChange={(e) => setNewForm({ ...newForm, type: e.target.value as RepoConfig['type'] })}
                        >
                            <option value="Branch">Branch</option>
                            <option value="Decrypted">Decrypted</option>
                            <option value="Encrypted">Encrypted</option>
                        </select>
                        <div className="flex gap-2">
                            <button className="btn btn-primary flex-1 text-xs" onClick={addRepo}>
                                <IconCheck size={14} />
                                确认
                            </button>
                            <button className="btn btn-ghost flex-1 text-xs" onClick={() => setAdding(false)}>
                                <IconX size={14} />
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 仓库列表 */}
            <div className="space-y-2">
                {repos.map((repo, idx) => (
                    <div key={idx} className="card p-4 flex items-center gap-4">
                        {editIdx === idx ? (
                            /* 编辑模式 */
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <input
                                    className="input-field"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                />
                                <select
                                    className="input-field"
                                    value={editForm.type}
                                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value as RepoConfig['type'] })}
                                >
                                    <option value="Branch">Branch</option>
                                    <option value="Decrypted">Decrypted</option>
                                    <option value="Encrypted">Encrypted</option>
                                </select>
                                <div className="flex gap-2">
                                    <button className="btn btn-primary flex-1 text-xs" onClick={confirmEdit}>
                                        <IconCheck size={14} />
                                    </button>
                                    <button className="btn btn-ghost flex-1 text-xs" onClick={() => setEditIdx(null)}>
                                        <IconX size={14} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* 展示模式 */
                            <>
                                <label className="toggle flex-shrink-0">
                                    <input type="checkbox" checked={repo.enabled} onChange={() => toggleRepo(idx)} />
                                    <div className="slider" />
                                </label>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate">{repo.name}</div>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${repo.type === 'Branch' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                                        repo.type === 'Decrypted' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                                            'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                    }`}>
                                    {repo.type}
                                </span>
                                <div className="flex gap-1 flex-shrink-0">
                                    <button
                                        className="p-1.5 rounded-md text-gray-400 hover:text-brand-500 hover:bg-brand-500/10 transition-colors"
                                        onClick={() => startEdit(idx)}
                                        title="编辑"
                                    >
                                        <IconEdit size={14} />
                                    </button>
                                    <button
                                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                        onClick={() => deleteRepo(idx)}
                                        title="删除"
                                    >
                                        <IconTrash size={14} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}

                {repos.length === 0 && (
                    <div className="card p-8 text-center">
                        <p className="text-gray-400 text-sm">暂无仓库配置</p>
                        <p className="text-gray-400 text-xs mt-1">点击上方按钮添加仓库</p>
                    </div>
                )}
            </div>
        </div>
    )
}
