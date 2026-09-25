import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/app-shell";
import { ErrorBoundary } from "./components/error-boundary";
import { useDemo } from "./demo/context";
import { resetDemo } from "./demo/commands";
import { ChangeRoomPage } from "./pages/change-room-page";
import { CreateChangePage } from "./pages/create-change-page";
import { ChangesIndexPage, DecisionsPage, EnvironmentsPage } from "./pages/empty-pages";
import { WorkbenchPage } from "./pages/workbench-page";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WorkbenchPage />} />
      <Route path="/changes" element={<ChangesIndexPage />} />
      <Route path="/changes/new" element={<CreateChangePage />} />
      <Route path="/changes/:changeId" element={<ChangeRoomPage />} />
      <Route path="/decisions" element={<DecisionsPage />} />
      <Route path="/environments" element={<EnvironmentsPage />} />
    </Routes>
  );
}

export function DemoApp() {
  const { dispatch } = useDemo();
  return (
    <ErrorBoundary onReset={() => dispatch(resetDemo())}>
      <AppShell>
        <AppRoutes />
      </AppShell>
    </ErrorBoundary>
  );
}
