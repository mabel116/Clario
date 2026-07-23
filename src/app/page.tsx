export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between text-sm flex flex-col gap-6">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Clario
        </h1>
        <p className="text-muted-foreground text-center max-w-md">
          Offline-first workspace providing financial clarity for solo freelancers.
        </p>
      </div>
    </main>
  );
}
