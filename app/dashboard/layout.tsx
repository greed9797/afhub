import { DashboardChrome } from './_components/DashboardChrome';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
