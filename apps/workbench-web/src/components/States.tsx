import { Button, Result, Skeleton, Spin } from "antd";
import type { ReactNode } from "react";

export function FullPageLoading() {
  return <div className="full-center"><Spin size="large" /><span className="full-center__text">正在连接本地项目</span></div>;
}

export function ConnectionFailure({ message }: { message: string }) {
  return (
    <div className="full-center">
      <Result status="warning" title="连接不上本地项目" subTitle={<>{message}<br />在终端运行 <code>pnpm workbench</code>，浏览器会以新的本地会话打开。</>} />
    </div>
  );
}

export function PageSkeleton() {
  return <div className="page"><Skeleton active paragraph={{ rows: 3 }} /><Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 32 }} /></div>;
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="page"><Result status="error" title="读取失败" subTitle={message} extra={onRetry && <Button onClick={onRetry}>重新读取</Button>} /></div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__mark" aria-hidden />
      <div className="empty__title">{title}</div>
      {children && <div className="empty__body">{children}</div>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
