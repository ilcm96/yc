// The production icon, as GitHub shows the YC app, whatever this build's channel.
import appIconUrl from "../../../../assets/prod/t3-black-web-icon-192x192.png";

export function T3AppIcon(props: { readonly className?: string }) {
  return <img src={appIconUrl} alt="" className={props.className} />;
}
