export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <title>Click A Tree - Mews Integration</title>
            </head>
            <body>{children}</body>
        </html>
    );
}
