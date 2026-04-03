import './globals.css'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'

export const metadata = {
  title: 'Forex Trading Bot',
  description: 'Autonomous forex trading bot',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-bg-page text-text-primary font-sans">
        <Sidebar />
        <div style={{ marginLeft: 52 }} className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  )
}
