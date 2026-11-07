export const PRODUCT_VERSION='0.10.0';
const website='https://brightspace-context.khin101.chatgpt.site';
export const PRODUCT_LINKS=Object.freeze({
  setup:`${website}/setup/`,
  download:`${website}/downloads/BrightspaceContext-${PRODUCT_VERSION}-windows-x64-setup.exe`,
  privacy:website+'/',
  github:'https://github.com/khin101wastaken/brightspace-context',
  support:`mailto:khinaungwrk@gmail.com?subject=${encodeURIComponent(`Brightspace Context ${PRODUCT_VERSION} support`)}`,
});
export function wireProductLinks(document) {
  for(const anchor of document.querySelectorAll('a[data-product-link]')) {
    const href=PRODUCT_LINKS[anchor.dataset.productLink];
    if(!href) throw new Error('Unknown product link.');
    anchor.href=href;
    if(href.startsWith('https:')) {anchor.target='_blank';anchor.rel='noopener noreferrer';}
  }
}
