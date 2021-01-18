const timeMachine = require('ganache-time-traveler');

const HospA = artifacts.require("./HospitalA.sol");
const HospB = artifacts.require("./HospitalB.sol");

contract("Two Hospitals With Encryption", accounts => {
    let ha_admin = accounts[0];
    let ha_patient = accounts[1];
    let ha_doctor = accounts[2];
    let ha_verifiers = accounts.slice(3, 3 + 5);

    let hb_admin = accounts[10];
    let hb_patient = accounts[11];
    let hb_verifiers = accounts.slice(12, 12 + 5);


    beforeEach(async() => {
        let snapshot = await timeMachine.takeSnapshot();
        snapshotId = snapshot['result'];
    });
  
    afterEach(async() => {
        await timeMachine.revertToSnapshot(snapshotId);
    });

    it("Correctness verification of sequence", async () => {
        var resp;

        // 0: Deploy contracts
        const hospA = await HospA.deployed({from: ha_admin});
        const hospB = await HospB.deployed({from: hb_admin});
        
        // 0: Register entities
        await hospA.registerPatient(ha_patient, {from: ha_admin});
        await hospA.registerDoctor(ha_doctor, {from: ha_admin});
        for (var i = 0; i < 5; i++)
            await hospA.registerVerifier({from: ha_verifiers[i]});

        await hospB.registerPatient(hb_patient, {from: hb_admin});
        for (var i = 0; i < 5; i++)
            await hospB.registerVerifier({from: hb_verifiers[i]});

        // 0: Submit document to hospB
        const bundleHash = web3.utils.keccak256(Math.random().toString());
        const documentKey = ~~(Math.random() * 9999999);
        const documentKeyHash = web3.utils.keccak256(web3.eth.abi.encodeParameters(['uint256'], [documentKey]));
        await hospB.submitDocument(bundleHash, documentKeyHash, {from: hb_patient});

        // 1-2: Doctor requests medical record
        const requestKey = ~~(Math.random() * Number.MAX_SAFE_INTEGER);
        const requestKeyHash = web3.utils.keccak256(web3.eth.abi.encodeParameters(['uint256'], [requestKey]));
        resp = await hospA.requestDocument(web3.utils.fromAscii(""), false, requestKeyHash, 1, 3, {from: ha_doctor});
        let doctorRequestId = resp.logs[0].args.requestId.toString();
        
        // 3-5: Patient delegates request to hospB
        resp = await hospB.requestOnBehalf(bundleHash, 1, 3, {from: hb_patient});
        let patientRequestId = resp.logs[0].args.requestId.toString();

        // 6-9: Verifiers verify medical records retrieval (select fastest correct verifier)
        let directResponseKeys = [~~(Math.random() * 9999999), documentKey, documentKey, ~~(Math.random() * 9999999), ~~(Math.random() * 9999999)];
        let tb_verifier, tb_patient;
        for (var i = 0; i < 5; i++) {
            try {
                resp = await hospB.addDirectResponse(patientRequestId, web3.utils.toHex(directResponseKeys[i].toString()), {from: hb_verifiers[i]});
            } catch (error) { console.log(error.message); }

            if (resp.logs.length == 2) {
                tb_verifier = resp.logs[0].args.verifierAddress;
                tb_patient = resp.logs[1].args.requesterAddress;
            }

            await timeMachine.advanceTimeAndBlock(25 * 60);
        }
        assert.equal(tb_verifier, hb_verifiers[2], "Reasoning 1");
        assert.equal(tb_patient, hb_patient, "Reasoning 2");

        // 10-13: Patient responds to doctor request
        await hospA.respondRequest(doctorRequestId, true, requestKey.toString(), {from: ha_patient});

        // 14-16: Verifiers request participation (select highest score verifier)
        let ta_verifier, ta_patient;
        for (var i = 0; i < 5; i++) {
            try {
                resp = await hospA.addIndirectResponse(doctorRequestId, {from: ha_verifiers[i]});
            } catch (error) { console.log(error.messasge); }

            if (resp.logs.length > 0) {
                console.log("herherhehrehrherer");
            }

            if (resp.logs.length == 2) {
                ta_verifier = resp.logs[0].args.verifierAddress;
                ta_patient = resp.logs[1].args.requesterAddress;
            }

            // await timeMachine.advanceTimeAndBlock(25 * 60);
        }
        assert.equal(ta_verifier, ha_verifiers[0], "Reasoning 3");
        assert.equal(ta_patient, ha_patient, "Reasoning 4");

        // ?: Verifier gets token from patient, uses it to query documents from tb_verifier, and announces availability of document
        // await hospA.documentAvailable(doctorRequestId, {from: ta_verifier});
        // let 

        
        // console.log((await web3.eth.getBlock(await web3.eth.getBlockNumber()))['timestamp']);
        
    });
})