export const RESULT_HEADLINES=Object.freeze([
  'UFO chốt đơn: mời cao nhân xuất hiện!',
  'Tín hiệu từ vũ trụ: đến lượt bạn rồi!',
  'Phi thuyền đã đến, cao nhân lên sóng!',
  'UFO đã bắt được tín hiệu học bá!',
  'Khách VIP, mời lên khoang trả bài!',
  'Vũ trụ tò mò: bạn nhớ bài chứ?',
  'Trạm vũ trụ đang chờ câu trả lời!',
  'Chuyến bay này cần phi hành gia thuộc bài!',
]);

/** Cosmetic shuffle bag: use every line before repeating, independent of the draw. */
export function createHeadlineCycle(random=Math.random){
  let bag=[],previous=null;
  return ()=>{
    if(!bag.length){
      bag=[...RESULT_HEADLINES];
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      if(bag[0]===previous)[bag[0],bag[1]]=[bag[1],bag[0]];
    }
    previous=bag.shift();return previous;
  };
}
