import { createRoot } from 'react-dom/client'
import App from './App'
import { IndexedDbFamilyTreeRepository } from './repository'

// Composition root: infrastructure adapters are created here and injected into UI.
// App depends only on the FamilyTreeRepository port, never on Dexie directly.
const repository = new IndexedDbFamilyTreeRepository()

createRoot(document.getElementById('root')!).render(<App repository={repository} />)
