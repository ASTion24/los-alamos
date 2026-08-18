import { useEffect, useState } from "react";
import { KeyRound, PlugZap, Save, ShieldCheck, X } from "lucide-react";
import type { WorkspaceHealth } from "./types";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onNotice: (message: string) => void;
}

interface Settings {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export function SettingsPanel({ open, onClose, onNotice }: SettingsPanelProps): JSX.Element | null {
  const [settings, setSettings] = useState<Settings>({
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    hasApiKey: false
  });
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<string | null>(null);
  const [health, setHealth] = useState<WorkspaceHealth | null>(null);

  useEffect(() => {
    if (!open) return;
    setConnectionResult(null);
    void Promise.all([window.los.getSettings(), window.los.getWorkspaceHealth()])
      .then(([nextSettings, nextHealth]) => {
        setSettings(nextSettings);
        setHealth(nextHealth);
      })
      .catch((error: unknown) => {
        onNotice(error instanceof Error ? error.message : String(error));
      });
  }, [open, onNotice]);

  if (!open) return null;

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      const updated = await window.los.saveSettings({
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: apiKey.trim() || undefined,
        clearApiKey
      });
      setSettings(updated);
      setApiKey("");
      setClearApiKey(false);
      onClose();
      onNotice("设置已保存。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async (): Promise<void> => {
    setTesting(true);
    setConnectionResult(null);
    try {
      await window.los.testSettings({
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: apiKey.trim() || undefined
      });
      setConnectionResult("连接正常");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnectionResult("连接失败");
      onNotice(message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="settings-plane" onClick={onClose}>
      <div
        className="settings-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-head">
          <h2 id="settings-title">模型设置</h2>
          <button className="icon-button" onClick={onClose} title="关闭设置" aria-label="关闭设置">
            <X size={18} />
          </button>
        </header>

        <div className={`workspace-health ${health && health.issues.length > 0 ? "warning" : ""}`}>
          <div>
            <ShieldCheck size={16} />
            <span>工作区</span>
            <strong>
              {health
                ? health.issues.length === 0
                  ? "正常"
                  : `${health.issues.length} 项需检查`
                : "检查中"}
            </strong>
          </div>
          {health?.issues[0] ? <small>{health.issues[0].message}</small> : null}
        </div>

        <div className="settings-form">
          <label className="settings-field">
            <span>接口地址</span>
            <input
              value={settings.baseUrl}
              onChange={(event) => setSettings((current) => ({ ...current, baseUrl: event.target.value }))}
            />
          </label>

          <label className="settings-field">
            <span>模型名</span>
            <input
              value={settings.model}
              onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))}
            />
          </label>

          <label className="settings-field full">
            <span>访问密钥</span>
            <div className="secret-field">
              <KeyRound size={17} />
              <input
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setClearApiKey(false);
                }}
                placeholder={settings.hasApiKey ? "已存入系统安全存储" : "尚未配置"}
              />
            </div>
          </label>

          {settings.hasApiKey ? (
            <label className="clear-secret">
              <input
                type="checkbox"
                checked={clearApiKey}
                onChange={(event) => setClearApiKey(event.target.checked)}
              />
              <span>移除已保存的密钥</span>
            </label>
          ) : null}

          <div className="settings-actions">
            <button
              className="test-settings"
              disabled={
                testing ||
                !settings.baseUrl.trim() ||
                !settings.model.trim() ||
                (!settings.hasApiKey && !apiKey.trim())
              }
              onClick={() => void testConnection()}
            >
              <PlugZap size={16} />
              {testing ? "测试中" : "测试连接"}
            </button>
            {connectionResult ? <span>{connectionResult}</span> : null}
            <button
              className="save-settings"
              disabled={
                busy ||
                !settings.baseUrl.trim() ||
                !settings.model.trim()
              }
              onClick={() => void save()}
            >
              <Save size={16} />
              保存设置
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
