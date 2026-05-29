import {
  ApiOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  FileTextOutlined,
  ForkOutlined,
  HistoryOutlined,
  PartitionOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Badge } from "antd";

export type NavItem = NonNullable<MenuProps["items"]>[number];

const FLAT_ITEMS: NavItem[] = [
  { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "/live", icon: <ThunderboltOutlined />, label: "Live Sessions" },
  { key: "/providers", icon: <ApiOutlined />, label: "Providers" },
  { key: "/routing", icon: <ForkOutlined />, label: "Routing" },
  { key: "/model-chain", icon: <PartitionOutlined />, label: "Model Chain" },
  { key: "/openai-gateway", icon: <CloudServerOutlined />, label: "OpenAI Gateway" },
  { key: "/history", icon: <HistoryOutlined />, label: "History" },
  { key: "/logs", icon: <FileTextOutlined />, label: "Server Logs" },
  { key: "/settings", icon: <SettingOutlined />, label: "Settings" },
];

export function buildNavItems(isLive: boolean): NavItem[] {
  return isLive ? markLiveItem(FLAT_ITEMS) : FLAT_ITEMS;
}

function markLiveItem(items: NavItem[]): NavItem[] {
  return items.map((item) => {
    if (item && "children" in item && Array.isArray(item.children)) {
      return { ...item, children: markLiveItem(item.children as NavItem[]) };
    }
    return item && "key" in item && item.key === "/live"
      ? {
          ...item,
          icon: (
            <Badge dot status="processing" offset={[3, -3]}>
              <ThunderboltOutlined />
            </Badge>
          ),
        }
      : item;
  });
}

export function selectedKeyFromPath(pathname: string): string {
  if (pathname === "/") return "/";
  for (const item of FLAT_ITEMS) {
    const key = String(item && "key" in item ? (item.key ?? "") : "");
    if (key && key !== "/" && (pathname === key || pathname.startsWith(`${key}/`))) return key;
  }
  return "/";
}
