// Works out books off the page's thread: a book's text takes about a tenth
// of a second to compute (longer on a phone), and the page keeps moving.
importScripts('babel.js');
let exit = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    exit = Babel.exitAddress();
    self.postMessage({ type: 'init', exit: exit.slice() });
  } else if (m.type === 'open') {
    const text = Babel.textOf(m.address);
    const isExit = !!exit && Babel.sameBook(m.address, exit);
    self.postMessage({ type: 'open', id: m.id, text, isExit }, [text.buffer]);
  }
};
