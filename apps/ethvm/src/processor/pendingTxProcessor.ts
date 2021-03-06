import { PendingTx } from '@app/models'

const dedup = (tx: PendingTx, pTxs: PendingTx[]): PendingTx[] => {
  for (let i = 0; i < pTxs.length; i++) {
    if (tx.getID() === pTxs[i].getID()) {
      pTxs.splice(i, 1)
    }
  }
  return pTxs
}

export const processPendingTxs = (tx: PendingTx, pTxs: PendingTx[]): PendingTx[] => {
  pTxs = dedup(tx, pTxs)
  pTxs.unshift(tx)
  return pTxs
}
