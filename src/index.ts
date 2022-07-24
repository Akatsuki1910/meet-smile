async function load() {
  const node = document.getElementsByTagName('body')[0]
  // node.appendChild(nicoImg)

  const s = document.createElement('script')
  s.type = 'text/javascript'
  s.src = chrome.runtime.getURL('./src/index2.js')
  node.appendChild(s)
}

window.addEventListener(
  'load',
  async (_evt: unknown) => {
    await load()
  },
  true,
)