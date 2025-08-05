"use client"

import { Separator } from "@raypx/ui/components/separator"
import { SettingsItem } from "./shared/settings-item"

export default function SettingsTab() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="text-base font-medium">通知设置</h4>
        <div className="space-y-3">
          <SettingsItem
            title="邮件通知"
            description="接收重要更新和通知邮件"
            action={{
              label: "开启",
              onClick: () => console.log("Toggle email notifications"),
            }}
          />
          <SettingsItem
            title="推送通知"
            description="浏览器推送通知"
            action={{
              label: "关闭",
              onClick: () => console.log("Toggle push notifications"),
            }}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="text-base font-medium">隐私设置</h4>
        <div className="space-y-3">
          <SettingsItem
            title="个人资料可见性"
            description="控制谁可以查看你的个人资料"
            action={{
              label: "公开",
              onClick: () => console.log("Toggle profile visibility"),
            }}
          />
          <SettingsItem
            title="活动状态"
            description="显示你的在线状态"
            action={{
              label: "显示",
              onClick: () => console.log("Toggle activity status"),
            }}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="text-base font-medium text-red-600">危险操作</h4>
        <div className="space-y-3">
          <SettingsItem
            title="停用账号"
            description="暂时停用你的账号，可以随时恢复"
            variant="danger"
            action={{
              label: "停用",
              onClick: () => console.log("Deactivate account"),
              variant: "outline",
            }}
          />
          <SettingsItem
            title="删除账号"
            description="永久删除你的账号和所有数据"
            variant="danger"
            action={{
              label: "删除",
              onClick: () => console.log("Delete account"),
              variant: "destructive",
            }}
          />
        </div>
      </div>
    </div>
  )
}
