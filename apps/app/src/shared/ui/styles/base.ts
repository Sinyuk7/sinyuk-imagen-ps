/** 基础 reset：box-sizing、原生表单元素归一、html/body 画布底色。 */
export const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;}
button,input,textarea,select{
  -webkit-appearance:none; appearance:none;
  font-family:inherit; font-size:inherit; font-weight:inherit; line-height:inherit;
  color:inherit; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; padding:0;
}
button{ border:0; background:transparent; }
html,body{
  width:100%; height:100%; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; padding:0;
  background:var(--app-color-canvas);
  font-family:var(--app-font-family-base); -webkit-font-smoothing:antialiased;
}
#root{ width:100%; height:100%; }
`;
