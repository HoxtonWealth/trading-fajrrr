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
      <body>{children}</body>
    </html>
  )
}
