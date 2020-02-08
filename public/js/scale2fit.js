(function(global) {
  /*
    Simple functions to scale content to fit it's parent
    
    Author: Liudmil Mitev
    License: WTFPL
    Demo: https://jsfiddle.net/oxzxyxqn/7/
    
  */
  function scaleAmountNeededToFit(el, margin = 0) {
    const parentSize = {
      width: el.parentElement.clientWidth - margin * 2,
      height: el.parentElement.clientHeight - margin * 2
    };

    return Math.min(parentSize.width / el.clientWidth,
      parentSize.height / el.clientHeight);
  }

  function fitToParent(element, margin) {
    const scale = scaleAmountNeededToFit(element, margin);
    element.style.transformOrigin = "0 0";
    element.style.transform = `translate(${margin}px, ${margin}px) scale(${scale})`;
  }

  global.fitToParent = fitToParent;
})(this);