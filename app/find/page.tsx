import FindClient from '../../components/FindClient';

export default function Page() {
  return (
    <main className="page" style={{ paddingBottom: 28 }}>
      <h1 className="h1">Find a wallet</h1>
      <p className="subtle" style={{ marginTop: 6 }}>
        Paste an Ethereum address (0x...) to view rewards.
      </p>

      <div style={{ marginTop: 12 }}>
        <FindClient />
      </div>
    </main>
  );
}
