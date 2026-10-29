import { Alert, Button, Popconfirm, Space } from "antd";
import { useAction, useWrite } from "../api/hooks";

/** Shown while a write's outcome is unknown. Retrying re-sends the identical request, never a new one. */
export function PendingWriteBar() {
  const { pending, busy, replay, discard } = useWrite();
  const act = useAction();
  if (!pending) return null;
  return (
    <div className="pending-bar">
      <Alert type="warning" showIcon
        title={`“${pending.label}” 的结果还没有确认`}
        description="请求可能已经生效。重新确认会发送同一个请求，不会重复执行。确认之前，其他写操作会暂停。"
        action={
          <Space>
            <Button type="primary" loading={busy} onClick={() => act(replay)}>重新确认</Button>
            <Popconfirm title="只有在确定它没有生效时才放弃" description="放弃后会丢失这个请求的身份。" okText="放弃" cancelText="保留" onConfirm={discard}>
              <Button>放弃</Button>
            </Popconfirm>
          </Space>
        } />
    </div>
  );
}
