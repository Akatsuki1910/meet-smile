async function load() {
  var node = document.getElementsByTagName('body')[0]
  // node.appendChild(nicoImg)

  const s = document.createElement('script')
  s.type = 'text/javascript'
  s.src = chrome.runtime.getURL('./test/index2.js')
  node.appendChild(s)
}

window.addEventListener(
  'load',
  async (evt) => {
    await load()
  },
  true,
)
