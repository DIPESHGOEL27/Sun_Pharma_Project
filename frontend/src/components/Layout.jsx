import { Outlet } from "react-router-dom";

export default function Layout() {
  // Just render the outlet with padding
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 lg:p-8">
        <Outlet />
      </div>
    </div>
  );
}
